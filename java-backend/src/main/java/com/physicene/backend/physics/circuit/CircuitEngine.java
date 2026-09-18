package com.physicene.backend.physics.circuit;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 电路引擎 Java 移植（阶段二 §3.8，方案 v1.0）——与前端 TS 版（frontend/src/experiments/circuit/solver/mna.ts）逐行等价：
 * MNA 直流/暂态、Norton 电源、后向欧拉伴随、二极管/继电器通断迭代 ≤20、gmin=1e-12、电表量程表。
 * 数值口径（R_CONTACT=1e-3、R_DIODE_ON=0.5、G_DIODE_OFF=1e-9）与 TS 完全一致，MnaParityTest 断言差 <1e-9。
 */
public final class CircuitEngine {

    public static final double R_CONTACT = 1e-3;
    public static final double R_SRC_MIN = 1e-3;
    public static final double OHM_EMF = 1.5;
    private static final double G_MIN = 1e-12;
    private static final double R_DIODE_ON = 0.5;
    private static final double G_DIODE_OFF = 1e-9;

    private CircuitEngine() {
    }

    // ===== 数据模型（与 TS types.ts/components.ts 对齐）=====

    public record PinRef(String comp, int pin) {
    }

    /** 元件：kind + props（数值属性） */
    public static final class Comp {
        public String id;
        public String kind;
        public Map<String, Object> props = new HashMap<>();

        public double num(String key, double fallback) {
            Object v = props.get(key);
            return v instanceof Number n && Double.isFinite(n.doubleValue()) ? n.doubleValue() : fallback;
        }

        public boolean bool(String key) {
            return Boolean.TRUE.equals(props.get(key));
        }

        public String str(String key) {
            Object v = props.get(key);
            return v == null ? "" : String.valueOf(v);
        }
    }

    public record Wire(PinRef a, PinRef b) {
    }

    public static final class Circuit {
        public List<Comp> components = new ArrayList<>();
        public List<Wire> wires = new ArrayList<>();
    }

    // ===== 电表量程（components.ts 原表）=====

    private static final Map<String, Double> AMMETER_R = Map.of("0.6A", 0.125, "3A", 0.025);
    private static final Map<String, Double> VOLTMETER_R = Map.of("3V", 3000.0, "15V", 15000.0);
    private static final Map<String, Double> GALVOMETER_R = Map.of("300μA", 100.0, "3mA", 30.0);
    private static final Map<String, Map<String, Double>> MULTIMETER_R = Map.of(
            "dcv", Map.of("2.5V", 50000.0, "10V", 200000.0, "50V", 1e6),
            "dca", Map.of("0.5mA", 200.0, "5mA", 20.0, "50mA", 2.0, "500mA", 0.2),
            "ohm", Map.of("×1", 15.0, "×10", 150.0, "×100", 1500.0, "×1k", 15000.0));

    private static double firstVal(Map<String, Double> t) {
        return t.values().iterator().next();
    }

    private static double meterR(Comp c) {
        return switch (c.kind) {
            case "ammeter" -> AMMETER_R.getOrDefault(c.str("rangeKey"), firstVal(AMMETER_R));
            case "voltmeter" -> VOLTMETER_R.getOrDefault(c.str("rangeKey"), firstVal(VOLTMETER_R));
            case "galvanometer" -> GALVOMETER_R.getOrDefault(c.str("rangeKey"), firstVal(GALVOMETER_R));
            default -> multimeterSpec(c).r;
        };
    }

    private static double multimeterR(Comp c) {
        String mode = c.str("mode");
        if (!"dca".equals(mode) && !"ohm".equals(mode)) {
            mode = "dcv";
        }
        return MULTIMETER_R.get(mode).getOrDefault(c.str("rangeKey"), firstVal(MULTIMETER_R.get(mode)));
    }

    private record MSpec(String mode, double range, double r) {
    }

    private static MSpec multimeterSpec(Comp c) {
        String mode = c.str("mode");
        if (!"dca".equals(mode) && !"ohm".equals(mode)) {
            mode = "dcv";
        }
        var t = MULTIMETER_R.get(mode);
        var k = c.str("rangeKey");
        return t.containsKey(k) ? new MSpec(mode, t.get(k), t.get(k)) : new MSpec(mode, firstVal(t), firstVal(t));
    }

    private static double lampR(Comp c) {
        double u = c.num("ratedU", 2.5), i = c.num("ratedI", 0.3);
        return i > 0 ? u / i : 1e9;
    }

    private static double wireSampleR(Comp c) {
        double rho = c.num("rho", 1.1e-6), L = c.num("L", 0.5), dmm = c.num("d", 0.5);
        double d = dmm * 1e-3, S = Math.PI * d * d / 4;
        return S > 0 ? rho * L / S : 1e9;
    }

    private static double photoR(Comp c) {
        double rd = c.num("rDark", 1e5), rl = c.num("rLight", 500);
        double light = Math.min(1, Math.max(0, c.num("light", 1)));
        return Math.exp(Math.log(rd) + (Math.log(rl) - Math.log(rd)) * light);
    }

    /** 二端电阻类（TS twoTerminalResistance；multimeter 欧姆挡返回 null） */
    static Double twoTerminalR(Comp c) {
        return switch (c.kind) {
            case "resistor" -> Math.max(1e-6, c.num("R", 100));
            case "lamp" -> lampR(c);
            case "ammeter", "voltmeter", "galvanometer" -> meterR(c);
            case "multimeter" -> "ohm".equals(mmMode(c)) ? null : multimeterR(c);
            case "photoresistor" -> photoR(c);
            case "wire_sample" -> wireSampleR(c);
            default -> null;
        };
    }

    private static String mmMode(Comp c) {
        String mode = c.str("mode");
        return "dca".equals(mode) || "ohm".equals(mode) ? mode : "dcv";
    }

    static int pinCount(String kind) {
        return switch (kind) {
            case "battery", "dc_source", "ac_source", "resistor", "lamp", "ammeter", "voltmeter", "galvanometer",
                 "capacitor", "inductor", "diode", "photoresistor", "wire_sample", "coil", "multimeter" -> 2;
            case "switch" -> 2;
            case "rheostat" -> 3;
            case "spdt_switch" -> 3;
            case "relay" -> 4;
            default -> 2;
        };
    }

    // ===== Netlist（TS netlist.ts：并查集 + 地=第一电源 pin1）=====

    public static final class Netlist {
        public int nodeCount;
        public int ground;
        public final Map<String, Integer> nodeIndex = new HashMap<>();
    }

    public static Netlist buildNetlist(Circuit circuit) {
        Map<String, String> parent = new HashMap<>();
        var find = new Object() {
            String f(String k) {
                String p = parent.getOrDefault(k, k);
                if (!p.equals(k)) {
                    p = f(p);
                    parent.put(k, p);
                }
                return p;
            }
        };
        List<String> allPins = new ArrayList<>();
        for (Comp c : circuit.components) {
            for (int p = 0; p < pinCount(c.kind); p++) {
                String k = c.id + ":" + p;
                allPins.add(k);
                parent.put(k, k);
            }
        }
        for (Wire w : circuit.wires) {
            String ka = w.a().comp() + ":" + w.a().pin();
            String kb = w.b().comp() + ":" + w.b().pin();
            if (!parent.containsKey(ka) || !parent.containsKey(kb)) {
                continue;
            }
            String ra = find.f(ka), rb = find.f(kb);
            if (!ra.equals(rb)) {
                parent.put(ra, rb);
            }
        }
        Map<String, Integer> rootIndex = new HashMap<>();
        Netlist net = new Netlist();
        for (String k : allPins) {
            String root = find.f(k);
            net.nodeIndex.put(k, rootIndex.computeIfAbsent(root, r -> rootIndex.size()));
        }
        net.nodeCount = rootIndex.size();
        Comp src = circuit.components.stream()
                .filter(c -> "battery".equals(c.kind) || "dc_source".equals(c.kind) || "ac_source".equals(c.kind))
                .findFirst().orElse(null);
        net.ground = src != null ? net.nodeIndex.getOrDefault(src.id + ":1", 0) : 0;
        return net;
    }

    // ===== 引擎状态与求解（TS mna.ts）=====

    public static final class EngineState {
        public final Map<String, Double> capV = new HashMap<>();
        public final Map<String, Double> indI = new HashMap<>();
        public final Map<String, Boolean> diodeOn = new HashMap<>();
        public final Map<String, Boolean> relayOn = new HashMap<>();

        public static EngineState initial(Circuit c) {
            EngineState s = new EngineState();
            for (Comp k : c.components) {
                switch (k.kind) {
                    case "capacitor" -> s.capV.put(k.id, k.num("v0", 0));
                    case "inductor" -> s.indI.put(k.id, k.num("i0", 0));
                    case "diode" -> s.diodeOn.put(k.id, false);
                    case "relay" -> s.relayOn.put(k.id, false);
                    default -> {
                    }
                }
            }
            return s;
        }
    }

    public record ElementResult(double v, double i, double p) {
    }

    public record SourceResult(double iOut, double vTerm, double rExt) {
    }

    public static final class DCSolution {
        public boolean ok;
        public int nodeCount;
        public double[] nodeV;
        public Map<String, Integer> nodeOf = new HashMap<>();
        public Map<String, ElementResult> elements = new LinkedHashMap<>();
        public Map<String, SourceResult> sources = new LinkedHashMap<>();
    }

    private record Ctx(String mode, double h, double t, EngineState state) {
    }

    private static double srcEmf(Comp c, Ctx ctx) {
        if ("ac_source".equals(c.kind)) {
            if (!"transient".equals(ctx.mode())) {
                return 0;
            }
            return c.num("vrms", 3) * Math.sqrt(2) * Math.sin(2 * Math.PI * c.num("freq", 50) * ctx.t());
        }
        if ("coil".equals(c.kind)) {
            return c.num("emf", 0);
        }
        return c.num("emf", 1.5);
    }

    private static double srcR(Comp c) {
        return Math.max(R_SRC_MIN, c.num("coil".equals(c.kind) ? "rw" : "r", 0));
    }

    private static boolean relayClosed(Comp c, EngineState st) {
        return st.relayOn.getOrDefault(c.id, false) != c.bool("normallyClosed");
    }

    private static double[] solveOnce(Circuit circuit, Netlist net, Ctx ctx) {
        int n = net.nodeCount - 1;
        if (n < 0) {
            return null;
        }
        int[] row = new int[net.nodeCount];
        for (int node = 0; node < net.nodeCount; node++) {
            row[node] = node == net.ground ? -1 : node < net.ground ? node : node - 1;
        }
        double[][] a = new double[n][n];
        double[] b = new double[n];
        var stampG = new Object() {
            void g(int na, int nb, double g) {
                int ra = row[na], rb = row[nb];
                if (ra >= 0) {
                    a[ra][ra] += g;
                }
                if (rb >= 0) {
                    a[rb][rb] += g;
                }
                if (ra >= 0 && rb >= 0) {
                    a[ra][rb] -= g;
                    a[rb][ra] -= g;
                }
            }
        };
        var stampI = new Object() {
            void i(int na, int nb, double i) {
                int ra = row[na], rb = row[nb];
                if (ra >= 0) {
                    b[ra] += i;
                }
                if (rb >= 0) {
                    b[rb] -= i;
                }
            }
        };
        for (int r = 0; r < n; r++) {
            a[r][r] += G_MIN;
        }
        for (Comp c : circuit.components) {
            int na = net.nodeIndex.getOrDefault(c.id + ":0", -1);
            int nb = net.nodeIndex.getOrDefault(c.id + ":1", -1);
            Double r2 = twoTerminalR(c);
            if (r2 != null) {
                stampG.g(na, nb, 1 / r2);
                continue;
            }
            switch (c.kind) {
                case "battery", "dc_source", "ac_source", "coil" -> {
                    double g = 1 / srcR(c);
                    stampG.g(na, nb, g);
                    stampI.i(na, nb, g * srcEmf(c, ctx));
                }
                case "relay" -> {
                    stampG.g(na, nb, 1 / Math.max(R_CONTACT, c.num("rCoil", 500)));
                    if (relayClosed(c, ctx.state())) {
                        int nc = net.nodeIndex.getOrDefault(c.id + ":2", -1);
                        int nd = net.nodeIndex.getOrDefault(c.id + ":3", -1);
                        stampG.g(nc, nd, 1 / R_CONTACT);
                    }
                }
                case "switch" -> {
                    if (c.bool("closed")) {
                        stampG.g(na, nb, 1 / R_CONTACT);
                    }
                }
                case "spdt_switch" -> {
                    int pos = (int) c.num("pos", 0);
                    if (pos == 1 || pos == 2) {
                        int nc = net.nodeIndex.getOrDefault(c.id + ":" + pos, -1);
                        stampG.g(na, nc, 1 / R_CONTACT);
                    }
                }
                case "rheostat" -> {
                    double rmax = c.num("Rmax", 20);
                    double pos = Math.min(1, Math.max(0, c.num("pos", 0.5)));
                    int nc = net.nodeIndex.getOrDefault(c.id + ":2", -1);
                    stampG.g(na, nc, 1 / Math.max(R_CONTACT, pos * rmax));
                    stampG.g(nc, nb, 1 / Math.max(R_CONTACT, (1 - pos) * rmax));
                }
                case "capacitor" -> {
                    if ("transient".equals(ctx.mode())) {
                        double g = c.num("C", 1e-3) / ctx.h();
                        stampG.g(na, nb, g);
                        stampI.i(na, nb, g * ctx.state().capV.getOrDefault(c.id, 0.0));
                    }
                }
                case "inductor" -> {
                    double rw = Math.max(R_CONTACT, c.num("rw", 0));
                    if ("dc".equals(ctx.mode())) {
                        stampG.g(na, nb, 1 / rw);
                    } else {
                        double lh = c.num("L", 1) / ctx.h();
                        double g = 1 / (rw + lh);
                        stampG.g(na, nb, g);
                        stampI.i(na, nb, -g * lh * ctx.state().indI.getOrDefault(c.id, 0.0));
                    }
                }
                case "diode" -> {
                    if (ctx.state().diodeOn.getOrDefault(c.id, false)) {
                        double g = 1 / R_DIODE_ON;
                        stampG.g(na, nb, g);
                        stampI.i(na, nb, g * c.num("vf", 0.7));
                    } else {
                        stampG.g(na, nb, G_DIODE_OFF);
                    }
                }
                case "multimeter" -> {
                    MSpec s = multimeterSpec(c);
                    if ("ohm".equals(s.mode())) {
                        double g = 1 / s.r();
                        stampG.g(na, nb, g);
                        stampI.i(nb, na, g * OHM_EMF);
                    } else {
                        stampG.g(na, nb, 1 / s.r());
                    }
                }
                default -> {
                }
            }
        }
        double[] x = LinearSolver.solveReal(a, b);
        if (x == null) {
            return null;
        }
        double[] v = new double[net.nodeCount];
        for (int node = 0; node < net.nodeCount; node++) {
            v[node] = row[node] >= 0 ? x[row[node]] : 0;
        }
        return v;
    }

    private static void extract(Circuit circuit, Netlist net, double[] v, Ctx ctx, DCSolution out) {
        for (Comp c : circuit.components) {
            double va = v[net.nodeIndex.getOrDefault(c.id + ":0", 0)];
            double vb = v[net.nodeIndex.getOrDefault(c.id + ":1", 0)];
            double vd = va - vb;
            double i = 0;
            Double r2 = twoTerminalR(c);
            if (r2 != null) {
                i = vd / r2;
            } else {
                switch (c.kind) {
                    case "battery", "dc_source", "ac_source", "coil" -> {
                        double g = 1 / srcR(c);
                        i = g * (vd - srcEmf(c, ctx));
                        double iOut = -i;
                        double rExt = Math.abs(iOut) > 1e-12 ? vd / iOut : Double.POSITIVE_INFINITY;
                        out.sources.put(c.id, new SourceResult(iOut, vd, rExt));
                    }
                    case "relay" -> i = vd / Math.max(R_CONTACT, c.num("rCoil", 500));
                    case "switch" -> i = c.bool("closed") ? vd / R_CONTACT : 0;
                    case "spdt_switch" -> {
                        int pos = (int) c.num("pos", 0);
                        i = pos == 1 || pos == 2
                                ? (va - v[net.nodeIndex.getOrDefault(c.id + ":" + pos, 0)]) / R_CONTACT : 0;
                    }
                    case "rheostat" -> {
                        double rmax = c.num("Rmax", 20);
                        double pos = Math.min(1, Math.max(0, c.num("pos", 0.5)));
                        double vc = v[net.nodeIndex.getOrDefault(c.id + ":2", 0)];
                        i = (va - vc) / Math.max(R_CONTACT, pos * rmax);
                    }
                    case "capacitor" -> i = "transient".equals(ctx.mode())
                            ? (c.num("C", 1e-3) / ctx.h()) * (vd - ctx.state().capV.getOrDefault(c.id, 0.0)) : 0;
                    case "inductor" -> {
                        double rw = Math.max(R_CONTACT, c.num("rw", 0));
                        if ("dc".equals(ctx.mode())) {
                            i = vd / rw;
                        } else {
                            double lh = c.num("L", 1) / ctx.h();
                            double g = 1 / (rw + lh);
                            i = g * vd + g * lh * ctx.state().indI.getOrDefault(c.id, 0.0);
                        }
                    }
                    case "diode" -> i = ctx.state().diodeOn.getOrDefault(c.id, false)
                            ? (vd - c.num("vf", 0.7)) / R_DIODE_ON : G_DIODE_OFF * vd;
                    case "multimeter" -> {
                        MSpec s = multimeterSpec(c);
                        i = "ohm".equals(s.mode()) ? (vd + OHM_EMF) / s.r() : vd / s.r();
                    }
                    default -> {
                    }
                }
            }
            out.elements.put(c.id, new ElementResult(vd, i, vd * i));
        }
    }

    private record SolveOut(double[] v, DCSolution sol) {
    }

    private static SolveOut solveWithDiodes(Circuit circuit, Netlist net, Ctx ctx) {
        List<Comp> switching = circuit.components.stream()
                .filter(c -> "diode".equals(c.kind) || "relay".equals(c.kind)).toList();
        for (int iter = 0; iter < 20; iter++) {
            double[] v = solveOnce(circuit, net, ctx);
            if (v == null) {
                return null;
            }
            DCSolution sol = new DCSolution();
            extract(circuit, net, v, ctx, sol);
            boolean changed = false;
            for (Comp d : switching) {
                ElementResult r = sol.elements.get(d.id);
                if ("diode".equals(d.kind)) {
                    boolean on = ctx.state().diodeOn.getOrDefault(d.id, false);
                    if (!on && r.v() > d.num("vf", 0.7) + 1e-9) {
                        ctx.state().diodeOn.put(d.id, true);
                        changed = true;
                    } else if (on && r.i() < -1e-12) {
                        ctx.state().diodeOn.put(d.id, false);
                        changed = true;
                    }
                } else {
                    boolean on = ctx.state().relayOn.getOrDefault(d.id, false);
                    double vOn = d.num("vOn", 2.5);
                    boolean want = on ? Math.abs(r.v()) >= 0.8 * vOn : Math.abs(r.v()) >= vOn;
                    if (want != on) {
                        ctx.state().relayOn.put(d.id, want);
                        changed = true;
                    }
                }
            }
            if (!changed || switching.isEmpty()) {
                return new SolveOut(v, sol);
            }
        }
        double[] v = solveOnce(circuit, net, ctx);
        if (v == null) {
            return null;
        }
        DCSolution sol = new DCSolution();
        extract(circuit, net, v, ctx, sol);
        return new SolveOut(v, sol);
    }

    public static DCSolution solveDC(Circuit circuit) {
        return solveDC(circuit, EngineState.initial(circuit));
    }

    public static DCSolution solveDC(Circuit circuit, EngineState state) {
        Netlist net = buildNetlist(circuit);
        DCSolution out = new DCSolution();
        out.nodeCount = net.nodeCount;
        out.nodeOf = net.nodeIndex;
        if (net.nodeCount == 0) {
            out.ok = false;
            out.nodeV = new double[0];
            return out;
        }
        Ctx ctx = new Ctx("dc", 1, 0, state);
        SolveOut r = solveWithDiodes(circuit, net, ctx);
        if (r == null) {
            out.ok = false;
            out.nodeV = new double[0];
            return out;
        }
        out.ok = true;
        out.nodeV = r.v();
        out.elements = r.sol().elements;
        out.sources = r.sol().sources;
        return out;
    }

    /** 暂态一步（后向欧拉）：调用方按需迭代；返回 null 表示奇异 */
    public static DCSolution transientStep(Circuit circuit, EngineState state, double h, double t) {
        Netlist net = buildNetlist(circuit);
        if (net.nodeCount == 0) {
            return null;
        }
        Ctx ctx = new Ctx("transient", h, t, state);
        SolveOut r = solveWithDiodes(circuit, net, ctx);
        if (r == null) {
            return null;
        }
        DCSolution out = new DCSolution();
        out.ok = true;
        out.nodeCount = net.nodeCount;
        out.nodeOf = net.nodeIndex;
        out.nodeV = r.v();
        out.elements = r.sol().elements;
        out.sources = r.sol().sources;
        for (Comp c : circuit.components) {
            ElementResult er = r.sol().elements.get(c.id);
            if ("capacitor".equals(c.kind)) {
                state.capV.put(c.id, er.v());
            }
            if ("inductor".equals(c.kind)) {
                state.indI.put(c.id, er.i());
            }
        }
        return out;
    }

    /** 稠密高斯消元（TS linear.ts solveReal 等价） */
    static final class LinearSolver {
        private LinearSolver() {
        }

        static double[] solveReal(double[][] a, double[] b) {
            int n = b.length;
            if (n == 0) {
                return new double[0];
            }
            double[][] m = new double[n][n + 1];
            for (int i = 0; i < n; i++) {
                System.arraycopy(a[i], 0, m[i], 0, n);
                m[i][n] = b[i];
            }
            for (int col = 0; col < n; col++) {
                int piv = col;
                for (int r = col + 1; r < n; r++) {
                    if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) {
                        piv = r;
                    }
                }
                if (Math.abs(m[piv][col]) < 1e-18) {
                    return null;
                }
                if (piv != col) {
                    double[] t = m[piv];
                    m[piv] = m[col];
                    m[col] = t;
                }
                double p = m[col][col];
                for (int r = col + 1; r < n; r++) {
                    double f = m[r][col] / p;
                    if (f == 0) {
                        continue;
                    }
                    for (int c = col; c <= n; c++) {
                        m[r][c] -= f * m[col][c];
                    }
                }
            }
            double[] x = new double[n];
            for (int r = n - 1; r >= 0; r--) {
                double s = m[r][n];
                for (int c = r + 1; c < n; c++) {
                    s -= m[r][c] * x[c];
                }
                x[r] = s / m[r][r];
            }
            return x;
        }
    }
}
