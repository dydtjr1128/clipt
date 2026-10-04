import { BrandMark } from '@/components/Icon';
import { mount } from '@/components/mount';
import { SettingsForm } from '@/components/SettingsForm';
import { t } from '@/shared/i18n';
import './options.css';

mount(
  <main class="options">
    <h1>
      <BrandMark size={20} />
      {[t('appShortName'), t('popupSettings')].join(' · ')}
    </h1>
    <div class="options-card">
      <SettingsForm />
    </div>
  </main>,
);
