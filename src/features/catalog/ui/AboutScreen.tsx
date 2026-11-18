import { bootstrap } from "../../../app/bootstrap";
import { FormTemplate } from "../../../app/templates/FormTemplate";
import { Card } from "../../../ui/Card";
import { StoreLogo } from "../../../ui/StoreLogo";
import { ShopContacts } from "../../checkout";

export function AboutScreen() {
  const name = bootstrap?.name ?? "Магазин";
  return (
    <FormTemplate
      title="О магазине"
      groups={[
        <Card key="shop">
          <StoreLogo name={name} />
          <h1 className="text-title-1">{name}</h1>
          <p className="text-meta text-muted-foreground">Магазин на платформе Korzina</p>
        </Card>,
        <Card key="contacts">
          <h2 className="text-title-3">Контакты и получение</h2>
          <ShopContacts enabled />
        </Card>,
      ]}
    />
  );
}
