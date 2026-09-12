package com.physicene.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

@SpringBootApplication
@EnableFeignClients(basePackages = "com.physicene.backend.ai.client")
public class PhysiceneApplication {

    public static void main(String[] args) {
        SpringApplication.run(PhysiceneApplication.class, args);
    }
}
