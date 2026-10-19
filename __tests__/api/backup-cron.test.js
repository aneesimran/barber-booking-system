import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/cron/backup-database/route";

describe("Automated Backup Cron API Route (/api/cron/backup-database)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = "aneeshairdresser@gmail.com";
  });

  function createGetRequest(secret) {
    const url = new URL("http://localhost:3000/api/cron/backup-database");
    if (secret !== undefined) url.searchParams.set("secret", secret);
    return { url: url.toString() };
  }

  it("returns 401 if cron secret is invalid or missing", async () => {
    const reqNoSecret = createGetRequest();
    const resNoSecret = await GET(reqNoSecret);
    expect(resNoSecret.status).toBe(401);
    const dataNoSecret = await resNoSecret.json();
    expect(dataNoSecret.error).toContain("Unauthorized");

    const reqWrongSecret = createGetRequest("wrong-secret");
    const resWrongSecret = await GET(reqWrongSecret);
    expect(resWrongSecret.status).toBe(401);
  });

  it("returns 401 on POST if authorization header is missing", async () => {
    const req = {
      headers: new Headers(),
    };
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Unauthorized");
  });
});
