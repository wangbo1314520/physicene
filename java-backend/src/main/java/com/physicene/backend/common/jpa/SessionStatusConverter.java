package com.physicene.backend.common.jpa;

import com.physicene.backend.exp.entity.ExperimentSessionEntity;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** DDL 枚举小写（'draft'）↔ Java 枚举大写（DRAFT）。 */
@Converter
public class SessionStatusConverter implements AttributeConverter<ExperimentSessionEntity.Status, String> {

    @Override
    public String convertToDatabaseColumn(ExperimentSessionEntity.Status status) {
        return status == null ? null : status.name().toLowerCase();
    }

    @Override
    public ExperimentSessionEntity.Status convertToEntityAttribute(String dbData) {
        return dbData == null ? null : ExperimentSessionEntity.Status.valueOf(dbData.toUpperCase());
    }
}
