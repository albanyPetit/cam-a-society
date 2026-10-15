import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "A Society Cam",
    short_name: "A Cam",
    description: "A shared disposable camera for The A Society events.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1a1410",
    theme_color: "#1a1410",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
