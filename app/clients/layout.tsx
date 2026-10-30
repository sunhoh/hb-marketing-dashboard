import { ShellMain } from "@/components/shell-main";

export default function Layout({ children }: LayoutProps<"/clients">) {
  return <ShellMain>{children}</ShellMain>;
}
