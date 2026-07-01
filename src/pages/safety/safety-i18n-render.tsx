import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { useHubLanguage, type HubLanguage } from "../../i18n-context";
import { translateSafetyText } from "./safety-i18n";

const HOST_TRANSLATABLE_PROPS = new Set(["aria-label", "placeholder", "title", "alt"]);
const COMPONENT_TRANSLATABLE_PROPS = new Set([
  "aria-label",
  "placeholder",
  "title",
  "alt",
  "label",
  "name",
  "subtitle",
  "description",
  "helperText",
  "emptyLabel",
  "loadingLabel",
]);
const SKIP_CHILDREN_FOR_HOSTS = new Set(["script", "style", "textarea", "code", "pre"]);

function localizePropValue(value: unknown, lang: HubLanguage): unknown {
  if (typeof value !== "string") return value;
  return translateSafetyText(lang, value);
}

export function localizeSafetyNode(node: ReactNode, lang: HubLanguage): ReactNode {
  if (typeof node === "string") return translateSafetyText(lang, node);
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((child) => localizeSafetyNode(child, lang));
  if (!isValidElement(node)) return node;

  const element = node as ReactElement<Record<string, unknown>>;
  const props = element.props || {};
  const isHostElement = typeof element.type === "string";
  const translatableProps = isHostElement ? HOST_TRANSLATABLE_PROPS : COMPONENT_TRANSLATABLE_PROPS;
  const nextProps: Record<string, unknown> = {};
  let changed = false;

  for (const [key, value] of Object.entries(props)) {
    if (translatableProps.has(key)) {
      const localized = localizePropValue(value, lang);
      if (localized !== value) {
        nextProps[key] = localized;
        changed = true;
      }
    }
  }

  if (
    "children" in props &&
    !(isHostElement && SKIP_CHILDREN_FOR_HOSTS.has(String(element.type).toLowerCase()))
  ) {
    const localizedChildren = Children.map(props.children as ReactNode, (child) =>
      localizeSafetyNode(child, lang)
    );
    if (localizedChildren !== props.children) {
      nextProps.children = localizedChildren;
      changed = true;
    }
  }

  return changed ? cloneElement(element, nextProps) : element;
}

export function SafetyI18nRender({ children }: { children: ReactNode }) {
  const { lang } = useHubLanguage();
  return <>{localizeSafetyNode(children, lang)}</>;
}
