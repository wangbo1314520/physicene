package com.physicene.backend.common.jpa;

import com.physicene.backend.physics.record.ExperimentRecordEntity;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class StatusConverter implements AttributeConverter<ExperimentRecordEntity.Status, String> {

    @Override
    public String convertToDatabaseColumn(ExperimentRecordEntity.Status status) {
        return status == null ? null : status.name().toLowerCase();
    }

    @Override
    public ExperimentRecordEntity.Status convertToEntityAttribute(String dbData) {
        return dbData == null ? null : ExperimentRecordEntity.Status.valueOf(dbData.toUpperCase());
    }
}
