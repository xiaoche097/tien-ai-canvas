"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function FetchInterceptor() {
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();

      if (process.env.NEXT_PUBLIC_CANVAS_INTEGRATION === "1" && url.startsWith("/api/") && url !== "/api/auth/session" && url !== "/api/auth/logout") {
        const target = `/motu${url}`;
        const request = input instanceof Request ? new Request(new URL(target, window.location.origin), input) : target;
        return originalFetch(request, init);
      }

      if (url.startsWith("/api/")) {
        const key = localStorage.getItem("bm_access_key");
        if (key) {
          const headers = new Headers(init?.headers);
          headers.set("x-access-key", key);
          const response = await originalFetch(input, { ...init, headers });

          // Global error handling for credit-related responses
          if (response.status === 402) {
            try {
              const data = await response.clone().json();
              toast.error(data.error?.message || "积分不足，请联系管理员充值");
            } catch {
              toast.error("积分不足，请联系管理员充值");
            }
          }

          return response;
        }
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
