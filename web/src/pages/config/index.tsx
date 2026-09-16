import { useTranslation } from "react-i18next";

import { AppConfigPanel } from "@/components/layout/app-config-modal";
import { StudioPageHeader } from "@/components/studio/studio-primitives";
import { Settings2 } from "lucide-react";

export default function ConfigPage() {
    const { t } = useTranslation();

    return (
        <main className="studio-page studio-config h-full overflow-y-auto">
            <div className="studio-container">
                <StudioPageHeader title={t("config.title")} icon={Settings2} />
                <AppConfigPanel />
            </div>
        </main>
    );
}
