FROM mysql:5.7
ENV MYSQL_ROOT_PASSWORD=root
ENV MYSQL_CHARSET=utf8mb4
ENV MYSQL_COLLATION=utf8mb4_unicode_ci
COPY init.sql /docker-entrypoint-initdb.d/
COPY my.cnf /etc/mysql/conf.d/ 