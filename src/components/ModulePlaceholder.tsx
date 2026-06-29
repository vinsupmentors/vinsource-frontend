import { ModuleName } from '@/types';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { Construction, Lock } from 'lucide-react';

interface Props {
  title: string;
  module: ModuleName;
  description?: string;
}

/**
 * Stand-in for business modules not yet built out (Sales, Finance, Production,
 * Placements, Digital Marketing). Still enforces module access: if the
 * effective access map doesn't include this module, shows a locked state
 * instead of the "coming soon" placeholder, so route guarding is real even
 * before each module's real UI exists.
 */
export function ModulePlaceholder({ title, module, description }: Props) {
  const { modules, loaded } = useModuleAccess();
  const level = modules[module];

  if (loaded && !level) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <Lock className="w-8 h-8 text-muted-foreground/40" />
        <div>
          <p className="font-semibold">No access to {title}</p>
          <p className="text-sm text-muted-foreground">
            Ask someone with Master Control to grant you access to this module.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      <div className="bg-card border rounded-xl p-10 flex flex-col items-center justify-center text-center gap-3">
        <Construction className="w-8 h-8 text-muted-foreground/40" />
        <div>
          <p className="font-semibold">{title} module is under construction</p>
          <p className="text-sm text-muted-foreground">
            You have {level} access — full functionality is being built out next.
          </p>
        </div>
      </div>
    </div>
  );
}
