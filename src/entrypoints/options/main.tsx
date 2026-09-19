import { mount } from '@/components/mount';
import { SettingsForm } from '@/components/SettingsForm';
import { t } from '@/shared/i18n';
import './options.css';

mount(
  <main class="options">
    <h1>
      <span aria-hidden="true">{'✂'}</span> {[t('appShortName'), t('popupSettings')].join(' · ')}
    </h1>
    <div class="options-card">
      <SettingsForm />
    </div>
  </main>,
);
