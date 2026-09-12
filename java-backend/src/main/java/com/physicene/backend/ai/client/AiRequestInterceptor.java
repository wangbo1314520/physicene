package com.physicene.backend.ai.client;

import feign.RequestInterceptor;
import feign.RequestTemplate;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.UUID;

/** Feign 请求拦截器：注入 X-Internal-Key + X-Request-Id 链路追踪（SD-3）。 */
@Component
public class AiRequestInterceptor implements RequestInterceptor {

    private final String internalKey;

    public AiRequestInterceptor(@Value("${ai.internal-key}") String internalKey) {
        this.internalKey = internalKey;
    }

    @Override
    public void apply(RequestTemplate template) {
        template.header("X-Internal-Key", internalKey);
        template.header("X-Request-Id", MDC.get("traceId") != null
                ? MDC.get("traceId") : UUID.randomUUID().toString());
    }
}
