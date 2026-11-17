import { useState } from "react";
import { Checkbox } from "../../ui/Checkbox";
import { ChipGroup } from "../../ui/ChipGroup";
import { Input } from "../../ui/Input";
import { InputWithAction } from "../../ui/InputWithAction";
import { KitSection } from "../../ui/KitSection";
import { ListItem } from "../../ui/ListItem";
import { Radio } from "../../ui/Radio";
import { SearchField } from "../../ui/SearchField";
import { Select } from "../../ui/Select";
import { Switch } from "../../ui/Switch";
import { TextArea } from "../../ui/TextArea";
import { demoOptions } from "./kit-mock";
export function InputsKit({ notify }: { notify: (message: string) => void }) {
  const [search, setSearch] = useState("");
  const [value, setValue] = useState("");
  const [text, setText] = useState("");
  const [delivery, setDelivery] = useState("delivery");
  const [checked, setChecked] = useState(true);
  return (
    <div className="space-y-3">
      <KitSection title="Поля ввода">
        <Input
          label="Ваше имя"
          placeholder="Как к вам обращаться"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Input label="Телефон" type="tel" defaultValue="+7" error="Введите номер полностью" />
        <Input label="Недоступное поле" disabled placeholder="Нет доступа" />
        <InputWithAction
          label="Промокод"
          placeholder="Введите код"
          action="Применить"
          onAction={() => notify("Промокод применён · пример")}
        />
        <TextArea
          label="Комментарий к заказу"
          placeholder="Что нам учесть?"
          maxLength={160}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <TextArea label="Комментарий с ошибкой" error="Проверьте комментарий" disabled />
        <SearchField value={search} onChange={setSearch} />
        <SearchField value="Томаты" onChange={setSearch} disabled />
      </KitSection>
      <KitSection title="Выбор">
        <Switch label="Принимать заказы" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
        <Switch label="Недоступный переключатель" disabled />
        <Checkbox label="Согласен с условиями" defaultChecked />
        <Checkbox label="Без выбора" />
        <Checkbox label="Недоступный флажок" disabled />
        <fieldset>
          <legend className="text-label">Способ получения</legend>
          {demoOptions.map((option) => (
            <Radio
              key={option.value}
              label={option.label}
              name="delivery-demo"
              disabled={option.disabled}
              checked={delivery === option.value}
              onChange={() => setDelivery(option.value)}
            />
          ))}
        </fieldset>
        <ListItem
          title="Уведомления"
          subtitle="Настройка в строке"
          value={<Switch label="Уведомления" defaultChecked />}
        />
        <Select label="Как получить заказ" value={delivery} options={demoOptions} onChange={setDelivery} />
        <Select label="Недоступный список" value="delivery" options={demoOptions} disabled onChange={setDelivery} />
      </KitSection>
      <KitSection title="Чипы">
        <ChipGroup label="Категории" value={delivery} options={demoOptions} onChange={setDelivery} />
      </KitSection>
    </div>
  );
}
