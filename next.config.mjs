/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lector de .xlsx para Meta Ads desde Excel (ver lib/reporting/metaExcelImport.ts): se usa tal cual
  // desde node_modules en vez de empaquetarlo.
  serverExternalPackages: ["exceljs"],
  experimental: {
    // El logo del cliente se sube por Server Action (ver uploadClientLogoAction): el límite por
    // defecto es 1 MB y el logo puede pesar hasta 2 MB.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
