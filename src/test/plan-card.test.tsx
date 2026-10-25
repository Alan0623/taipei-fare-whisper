import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlanCard } from "@/components/plan-card";
import { PLANS } from "@/lib/flight-api";

const tokyo = PLANS[0]!;

function renderCard(subscription?: { target_price: number }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlanCard
        plan={tokyo}
        email="user@example.com"
        subscription={
          subscription && {
            route: tokyo.route,
            plan_name: "tokyo",
            currency: "TWD",
            ...subscription,
          }
        }
      />
    </QueryClientProvider>,
  );
}

describe("PlanCard", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the plan and target price when subscribing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, route: "TPE-TYO", target_price: 10000 })),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderCard();

    fireEvent.change(screen.getByLabelText("目標價 (TWD)"), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: /開始追蹤/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/subscribe$/);
    expect(JSON.parse(init.body)).toEqual({
      email: "user@example.com",
      plan_name: "tokyo",
      target_price: 10000,
    });
  });

  it("shows the subscribed state with the saved target", () => {
    renderCard({ target_price: 12000 });

    expect(screen.getByText("已訂閱 / Subscribed")).toBeInTheDocument();
    expect(screen.getByLabelText("目標價 (TWD)")).toHaveValue(12000);
    expect(screen.getByRole("button", { name: /更新目標價/ })).toBeInTheDocument();
  });

  it("shows the API error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "boom" }), { status: 400 })),
    );
    renderCard();

    fireEvent.change(screen.getByLabelText("目標價 (TWD)"), { target: { value: "9000" } });
    fireEvent.click(screen.getByRole("button", { name: /開始追蹤/ }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});
