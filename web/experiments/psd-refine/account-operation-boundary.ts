// Prevent replies started under one account from updating another account's UI.
export class AccountOperationBoundary {
    userId: string | null = null;
    private revision = 0;
    private controllers = new Set<AbortController>();

    adopt(userId: string | null) {
        if (this.userId === userId) return false;
        const changed = this.userId !== null;
        this.userId = userId;
        if (changed) {
            this.revision++;
            for (const controller of this.controllers) controller.abort();
            this.controllers.clear();
        }
        return changed;
    }
    begin() {
        const revision = this.revision;
        const controller = new AbortController();
        this.controllers.add(controller);
        return {
            signal: controller.signal,
            assertCurrent: () => {
                if (controller.signal.aborted || revision !== this.revision) throw new DOMException("账号已变化，旧会话操作已取消。", "AbortError");
            },
            dispose: () => { this.controllers.delete(controller); },
        };
    }
}
