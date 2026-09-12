package com.physicene.backend.common.jpa;

import com.physicene.backend.common.auth.UserEntity;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** DDL 枚举小写（'student'）↔ Java 枚举大写（STUDENT）映射。 */
@Converter
public class RoleConverter implements AttributeConverter<UserEntity.Role, String> {

    @Override
    public String convertToDatabaseColumn(UserEntity.Role role) {
        return role == null ? null : role.name().toLowerCase();
    }

    @Override
    public UserEntity.Role convertToEntityAttribute(String dbData) {
        return dbData == null ? null : UserEntity.Role.valueOf(dbData.toUpperCase());
    }
}
