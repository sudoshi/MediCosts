from sqlalchemy.orm import DeclarativeBase

SCHEMA = "clearnetwork"


class Base(DeclarativeBase):
    __table_args__ = {"schema": SCHEMA}
