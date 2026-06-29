import { Providers } from '../providers';

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
