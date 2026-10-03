import OrgProvider from "@/components/org/OrgProvider";

export default async function OrgLayout(props: LayoutProps<"/org/[id]">) {
  const { id } = await props.params;
  return <OrgProvider id={id}>{props.children}</OrgProvider>;
}
