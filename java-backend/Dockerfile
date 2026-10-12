# 全局 ARG（供 FROM 引用——必须置于任何 FROM 之前）
ARG RUNTIME_BASE=eclipse-temurin:17-jre-alpine

# ── 阶段 1：构建（依赖 go-offline 单独成层，源码改动不重下依赖）──
# 国内加速（可选）：--build-arg MAVEN_MIRROR=https://maven.aliyun.com/repository/public
FROM maven:3.9-eclipse-temurin-17 AS builder
ARG MAVEN_MIRROR=""
WORKDIR /build
RUN if [ -n "$MAVEN_MIRROR" ]; then \
      mkdir -p /root/.m2 && printf '<settings><mirrors><mirror><id>m</id><mirrorOf>central</mirrorOf><url>%s</url></mirror></mirrors></settings>' "$MAVEN_MIRROR" > /root/.m2/settings.xml; \
    fi
COPY pom.xml ./
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn package -DskipTests -B

# ── 阶段 2：运行（默认 temurin 17 JRE alpine ~190MB；RUNTIME_BASE 可换
#    maven:3.9-eclipse-temurin-17 复用构建镜像/JDK 全量 ~512MB——网络受限时的等价兜底）──
FROM ${RUNTIME_BASE}
RUN addgroup -S app 2>/dev/null || groupadd app; adduser -S app -G app 2>/dev/null || useradd -g app app
WORKDIR /app
COPY --from=builder /build/target/*.jar app.jar
USER app
ENV TZ=Asia/Shanghai \
    JAVA_OPTS=""
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=10 \
  CMD (wget -q -O /dev/null http://localhost:8080/actuator/health 2>/dev/null \
       || curl -fsS http://localhost:8080/actuator/health \
       || bash -c '</dev/tcp/localhost/8080') || exit 1
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
