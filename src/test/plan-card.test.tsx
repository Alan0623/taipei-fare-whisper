import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlanCard } from "@/components/plan-card";
import { PLANS, type Subscription } from "@/lib/flight-api";

const tokyo = PLANS[0]!;

function renderCard(subscription?: Partial<Subscription>) {
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
            target_price: 12000,
            subscription_status: "active",
            ...subscription,
          }
        }
      />
    </QueryClientProvider>,
  );
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("PlanCard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts the plan and target price, then hands the browser to the ECPay checkout", async () => {
    const checkout =
      '<form action="https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5"></form>';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(checkout, { headers: { "content-type": "text/html; charset=utf-8" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const write = vi.spyOn(document, "write").mockImplementation(() => {});
    vi.spyOn(document, "open").mockReturnValue(document as never);
    vi.spyOn(document, "close").mockImplementation(() => {});
    renderCard();

    fireEvent.change(screen.getByLabelText("目標價 (TWD)"), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: /開始追蹤/ }));

    await waitFor(() => expect(write).toHaveBeenCalledWith(checkout));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/subscribe$/);
    expect(JSON.parse(init.body)).toEqual({
      email: "user@example.com",
      plan_name: "tokyo",
      target_price: 10000,
    });
  });

  it("updates an active subscription in place without leaving the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(json({ ok: true, target_price: 9000, subscription_status: "active" })),
    );
    const write = vi.spyOn(document, "write");
    renderCard({ target_price: 12000 });

    expect(screen.getByText("已訂閱 / Subscribed")).toBeInTheDocument();
    expect(screen.getByLabelText("目標價 (TWD)")).toHaveValue(12000);
    fireEvent.click(screen.getByRole("button", { name: /更新目標價/ }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(write).not.toHaveBeenCalled();
  });

  it("asks an unpaid subscriber to finish paying", () => {
    renderCard({ subscription_status: "pending_payment" });

    expect(screen.getByText("未完成付款 / Unpaid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /完成付款/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /取消訂閱/ })).not.toBeInTheDocument();
  });

  it("shows how long a cancelled subscription stays active", () => {
    renderCard({ subscription_status: "cancelled", current_period_end_date: "2026-11-26" });

    expect(screen.getByText("已取消 / Cancelled")).toBeInTheDocument();
    expect(screen.getByText(/有效至 2026-11-26/)).toBeInTheDocument();
  });

  it("offers to resubscribe once expired", () => {
    renderCard({ subscription_status: "expired" });

    expect(screen.getByRole("button", { name: /重新訂閱/ })).toBeInTheDocument();
  });

  it("cancels an active subscription after confirmation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ ok: true, subscription_status: "cancelled" }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    renderCard({});

    fireEvent.click(screen.getByRole("button", { name: /取消訂閱/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/cancel$/);
    expect(JSON.parse(init.body)).toEqual({ email: "user@example.com", route: "TPE-TYO" });
  });

  it("shows the API error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "boom" }, 400)));
    renderCard();

    fireEvent.change(screen.getByLabelText("目標價 (TWD)"), { target: { value: "9000" } });
    fireEvent.click(screen.getByRole("button", { name: /開始追蹤/ }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});
