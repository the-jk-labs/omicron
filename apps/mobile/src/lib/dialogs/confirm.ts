import { createStore } from "@/lib/store";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  /** Offers a "notify" checkbox (moderator actions); its state is returned. */
  notify?: string;
};

export type ConfirmResult = { confirmed: boolean; notify: boolean };

type Pending = ConfirmOptions & { resolve: (result: ConfirmResult) => void };

export const pendingConfirm = createStore<Pending | null>(null);

/** The web's promise-based `confirm()` (ui/confirm.ts), as a bits-ui-styled alert dialog. */
export function confirmDialog(options: ConfirmOptions): Promise<ConfirmResult> {
  pendingConfirm.get()?.resolve({ confirmed: false, notify: false });
  return new Promise((resolve) => pendingConfirm.set({ ...options, resolve }));
}

/** Shorthand when only the yes/no matters. */
export const confirm = async (options: ConfirmOptions) => (await confirmDialog(options)).confirmed;
