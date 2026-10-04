import { ICONS, ICON_SVG_ATTRS, shapeAttrs, type IconName, type IconShape } from '@/shared/icons';

/** SVG 아이콘 (docs/ux-design.md 2절). 장식용이라 보조기술에는 숨긴다 */
export function Icon({ name, class: className = 'icon' }: { name: IconName; class?: string }) {
  return (
    <svg {...ICON_SVG_ATTRS} class={className}>
      {(ICONS[name] as readonly IconShape[]).map((shape) => (
        <path key={shape.d} {...shapeAttrs(shape)} />
      ))}
    </svg>
  );
}

/** 화면 제목 옆 브랜드 표시(확장 아이콘). 바로 옆에 이름이 있어 대체 텍스트는 비운다 */
export function BrandMark({ size = 18 }: { size?: number }) {
  return <img class="brand-mark" src="/icon/32.png" alt={''} width={size} height={size} />;
}
