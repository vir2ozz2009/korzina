import { useState } from "react";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { ChipGroup } from "../../ui/ChipGroup";
import { Input } from "../../ui/Input";
import { Price } from "../../ui/Price";
import { CatalogTemplate } from "../templates/CatalogTemplate";
import { CheckoutTemplate } from "../templates/CheckoutTemplate";
import { FeedbackTemplate } from "../templates/FeedbackTemplate";
import { FormTemplate } from "../templates/FormTemplate";
import { HomeTemplate } from "../templates/HomeTemplate";
import { ListTemplate } from "../templates/ListTemplate";
import { OrderTemplate } from "../templates/OrderTemplate";
import { ProductTemplate } from "../templates/ProductTemplate";
import { type TemplateName, templateNames } from "../templates/types";

// Template examples live only inside the kit; customer routes always use server data.
export function TemplatesKit() {
  const [template, setTemplate] = useState<TemplateName>("home");
  const [name, setName] = useState("Korzina");
  const [saved, setSaved] = useState(name);
  const title = `Шаблон · ${template}`;
  const body = (
    <Card>
      <h2 className="text-title-3">Содержимое секции</h2>
      <p className="text-meta">Пример компоновки из UI-кита</p>
    </Card>
  );
  const screen = () => {
    switch (template) {
      case "home":
        return <HomeTemplate title={title} sections={[body]} />;
      case "catalog":
        return (
          <CatalogTemplate title={title}>
            {body}
            {body}
          </CatalogTemplate>
        );
      case "product":
        return (
          <ProductTemplate
            title={title}
            gallery={body}
            info={body}
            buyBar={<Price currency="RUB" amountMinor={18900} />}
          />
        );
      case "checkout":
        return (
          <CheckoutTemplate
            title={title}
            sections={[body]}
            summary={<Price currency="RUB" amountMinor={18900} />}
            cta="Продолжить"
          />
        );
      case "order":
        return <OrderTemplate title={title} status={body} sections={[body]} />;
      case "form":
        return (
          <FormTemplate
            title={title}
            dirty={name !== saved}
            groups={[
              <Input
                key="name"
                label="Название магазина"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />,
            ]}
            onSubmit={() => setSaved(name)}
          />
        );
      case "list":
        return <ListTemplate title={title}>{body}</ListTemplate>;
      case "feedback":
        return <FeedbackTemplate title={title} body={body} actions={<Button full>Готово</Button>} />;
    }
  };
  return (
    <div className="space-y-3">
      <ChipGroup
        label="Шаблон экрана"
        options={templateNames.map((value) => ({ value, label: value }))}
        value={template}
        onChange={(value) => setTemplate(value as TemplateName)}
      />
      {screen()}
    </div>
  );
}
