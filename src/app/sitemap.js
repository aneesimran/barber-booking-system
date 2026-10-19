import { barbers } from "@/config/barbers";

export default async function sitemap() {
  const baseUrl = "https://booking.aneeshairdressers.co.uk";
  
  const barberUrls = barbers.map((barber) => ({
    url: `${baseUrl}/booking/${barber.id}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    ...barberUrls,
  ];
}
