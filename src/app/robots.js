export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/"],
      },
    ],
    sitemap: "https://booking.aneeshairdressers.co.uk/sitemap.xml",
  };
}
