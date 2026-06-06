"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [client] = useState(() => {
    const handlePolicyBlock = (err: any) => {
      if (
        err &&
        typeof err === "object" &&
        err.status === 403 &&
        err.message === "POLICY_REACCEPTANCE_REQUIRED"
      ) {
        router.push("/legal/tos?reaccept=true");
      }
    };

    return new QueryClient({
      defaultOptions: { queries: { refetchOnWindowFocus: false } },
      queryCache: new QueryCache({
        onError: handlePolicyBlock,
      }),
      mutationCache: new MutationCache({
        onError: handlePolicyBlock,
      }),
    });
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
