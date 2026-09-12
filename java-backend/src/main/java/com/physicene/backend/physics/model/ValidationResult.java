package com.physicene.backend.physics.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/** 校验结果（SRS F2.9）：error 拦截保存，warning 仅提示放行。 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ValidationResult {

    private boolean valid;

    private List<ValidationError> errors;
}
