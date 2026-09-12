package com.physicene.backend.common.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 用户表（SRS §5.2 user；实现位置按追溯矩阵 F1 → common/鉴权）。 */
@Entity
@Table(name = "user")
public class UserEntity {

    public enum Role {STUDENT, TEACHER, ADMIN}

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50, unique = true)
    private String username;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Convert(converter = com.physicene.backend.common.jpa.RoleConverter.class)
    @Column(nullable = false, length = 10)
    private Role role;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(name = "class_id")
    private Long classId;

    public Long getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public Role getRole() {
        return role;
    }

    public void setRole(Role role) {
        this.role = role;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}
