import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createClient } from "./client";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  const api = createClient("https://api.test", async () => "tok123");

  it("attaches the bearer token and parses JSON", async () => {
    const fetchFn = mockFetch(200, [{ symbol: "AAPL", upper: 200, lower: null, latest: null, alertState: {} }]);
    const items = await api.getWatchlist();
    expect(items[0].symbol).toBe("AAPL");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/watchlist");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok123");
  });

  it("sends JSON body for putWatch and encodes the symbol", async () => {
    const fetchFn = mockFetch(200, { symbol: "BRK.B", upper: 1, lower: null });
    await api.putWatch("BRK.B", { upper: 1 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/watchlist/BRK.B");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ upper: 1 });
  });

  it("throws ApiError with the server message", async () => {
    mockFetch(400, { error: "lower must be less than upper" });
    await expect(api.putWatch("AAPL", { upper: 1, lower: 2 })).rejects.toEqual(
      new ApiError(400, "lower must be less than upper"),
    );
  });

  it("handles 204 with no body", async () => {
    mockFetch(204, undefined);
    await expect(api.deleteWatch("AAPL")).resolves.toBeUndefined();
  });

  it("builds history query string", async () => {
    const fetchFn = mockFetch(200, { prices: [], sentiment: [] });
    await api.getHistory("AAPL", 14);
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://api.test/symbols/AAPL/history?days=14",
    );
  });
});
