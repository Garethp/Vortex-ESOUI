import React from "react";
import { ListGroup, ListGroupItem } from "react-bootstrap";
import { ModListItem } from "../ESOUIClient";

type Props = {
  mod: ModListItem;
  onSelect: (id: number) => void;
};

export default ({ mod, onSelect }: Props) => (
  <ListGroupItem>
    <div onClick={() => onSelect(mod.id)}>
      <span>{mod.title}</span> - <span>{mod.author}</span>
    </div>
  </ListGroupItem>
);
