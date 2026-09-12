package com.physicene.backend.physics.model;

import lombok.Data;

import java.util.Map;

/** 数据表行（SRS F2.9）：t + 字段名到数值，如 {"v1":3.2,"Ek":5.1}。 */
@Data
public class DataRow {

    private double t;

    private Map<String, Double> fields;
}
