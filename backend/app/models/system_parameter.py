from sqlalchemy import Column, String, Text, CheckConstraint

from .base import BaseModel


class SystemParameter(BaseModel):
    __tablename__ = "system_parameters"

    name = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=False)
    value_type = Column(String(20), nullable=False, default="string")
    description = Column(Text)

    __table_args__ = (
        CheckConstraint(
            "value_type IN ('string', 'int', 'bool', 'float', 'json')",
            name="ck_param_value_type"
        ),
    )

    def get_value(self):
        if self.value_type == "int":
            return int(self.value)
        elif self.value_type == "bool":
            return self.value.lower() == "true"
        elif self.value_type == "json":
            import json
            return json.loads(self.value)
        elif self.value_type == "float":
            return float(self.value)
        return self.value

    def set_value(self, value):
        if self.value_type == "int":
            self.value = str(int(value))
        elif self.value_type == "bool":
            self.value = "true" if value else "false"
        elif self.value_type == "json":
            import json
            self.value = json.dumps(value, ensure_ascii=False)
        elif self.value_type == "float":
            self.value = str(float(value))
        else:
            self.value = str(value)

    def __repr__(self):
        return f"<SystemParameter(name={self.name}, type={self.value_type})>"
