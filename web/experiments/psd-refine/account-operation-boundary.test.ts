import { expect, test } from "bun:test";
import { AccountOperationBoundary } from "./account-operation-boundary";

test("a late response from the previous account cannot update UI", async () => {
    const boundary = new AccountOperationBoundary(); boundary.adopt("account-a");
    const operation = boundary.begin();
    let complete!: () => void;
    const waiting = new Promise<void>((resolve) => { complete = resolve; });
    let updated = false;
    const request = waiting.then(() => { operation.assertCurrent(); updated = true; });
    expect(boundary.adopt("account-b")).toBe(true);
    expect(operation.signal.aborted).toBe(true);
    complete(); await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(updated).toBe(false); operation.dispose();
    const next = boundary.begin(); expect(() => next.assertCurrent()).not.toThrow(); next.dispose();
});

test("logout cancels outstanding operations but same-user refresh leaves them intact", () => {
    const boundary = new AccountOperationBoundary(); boundary.adopt("account-a");
    const operation = boundary.begin();
    expect(boundary.adopt("account-a")).toBe(false);
    expect(operation.signal.aborted).toBe(false);
    boundary.adopt(null);
    expect(operation.signal.aborted).toBe(true);
    boundary.adopt("account-a");
    expect(() => operation.assertCurrent()).toThrow("账号已变化"); operation.dispose();
});
