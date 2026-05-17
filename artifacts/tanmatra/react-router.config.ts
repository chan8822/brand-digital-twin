import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "src",
  ssr: false,
  prerender: [
    "/",
    "/menu",
    "/wellness",
    "/performance",
    "/clinical",
    "/team",
    "/faq"
  ],
} satisfies Config;
