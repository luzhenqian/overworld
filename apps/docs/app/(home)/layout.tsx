import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { HomeNavigation } from '@/components/home-navigation';
import { baseOptions } from '@/lib/layout.shared';

export default function Layout({ children }: LayoutProps<'/'>) {
  const options = baseOptions();
  return (
    <HomeLayout
      {...options}
      nav={{ ...options.nav, component: <HomeNavigation /> }}
    >
      {children}
    </HomeLayout>
  );
}
