export const sellerRoots = ["/seller", "/seller/orders", "/seller/products", "/seller/money", "/seller/more"] as const;
export function sellerTab(href: string) {
  const path = href.split(/[?#]/)[0];
  return sellerRoots.findLast((root) => path === root || path.startsWith(`${root}/`)) ?? "/seller";
}

export class TabHistory {
  private stacks = new Map<string, string[]>();
  private positions = new Map<string, number>();

  visit(href: string) {
    const root = sellerTab(href);
    const stack = this.stacks.get(root) ?? [root];
    const index = stack.indexOf(href);
    this.stacks.set(root, index < 0 ? [...stack, href] : stack.slice(0, index + 1));
  }
  savePosition(href: string, top: number) {
    this.positions.set(href, top);
  }
  destination(root: string, activeRoot: string) {
    const href = root === activeRoot ? root : (this.stacks.get(root)?.at(-1) ?? root);
    return { href, top: root === activeRoot ? 0 : (this.positions.get(href) ?? 0) };
  }
  back(href: string) {
    const root = sellerTab(href);
    const stack = this.stacks.get(root) ?? [root, href];
    return stack.at(-2) ?? root;
  }
}
export const sellerHistory = new TabHistory();
