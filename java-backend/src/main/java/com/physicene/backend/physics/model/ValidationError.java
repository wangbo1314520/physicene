package com.physicene.backend.physics.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 结构化校验错误（SRS F2.9，对应 API code=1001 的 data 元素）。 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ValidationError {

    /** 出错字段路径，如 "elements[0].properties.mass" */
    private String field;

    /** 期望，如 ">0" */
    private String expected;

    /** 实际值（字符串化） */
    private String actual;

    /** 面向学生的提示文案 */
    private String message;

    /** "error"（拦截）| "warning"（放行仅提示） */
    private String level;
}
