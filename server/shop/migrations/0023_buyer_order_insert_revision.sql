CREATE TRIGGER buyer_order_created AFTER INSERT ON orders BEGIN
  INSERT INTO buyer_order_revisions(customer, revision) VALUES(NEW.customer, 1)
  ON CONFLICT(customer) DO UPDATE SET revision=revision+1;
END;
