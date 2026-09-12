package com.physicene.backend.common.jpa;

import com.physicene.backend.scene.model.ExperimentScenarioEntity;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class SourceConverter implements AttributeConverter<ExperimentScenarioEntity.Source, String> {

    @Override
    public String convertToDatabaseColumn(ExperimentScenarioEntity.Source source) {
        return source == null ? null : source.name().toLowerCase();
    }

    @Override
    public ExperimentScenarioEntity.Source convertToEntityAttribute(String dbData) {
        return dbData == null ? null : ExperimentScenarioEntity.Source.valueOf(dbData.toUpperCase());
    }
}
