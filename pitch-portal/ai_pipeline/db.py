import pymysql
from config_manager import ConfigManager


def get_db_connection():
    c = ConfigManager.get_instance().database()
    return pymysql.connect(
        host=c.get("host", "127.0.0.1"),
        port=int(c.get("port", 3306)),
        user=c.get("user", "root"),
        password=c.get("password", ""),
        database=c.get("database", "ajay_pitch"),
        charset=c.get("charset", "utf8mb4"),
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )
