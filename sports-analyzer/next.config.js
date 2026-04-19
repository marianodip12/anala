/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      // Headers necesarios para SharedArrayBuffer (ffmpeg.wasm)
      // Solo en las páginas de partido donde se usa el editor de clips
      {
        source: "/partido/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" }, // 'credentialless' permite iframes externos (YouTube)
        ],
      },
      // Los archivos WASM deben poder ser cargados con estos headers
      {
        source: "/ffmpeg/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
