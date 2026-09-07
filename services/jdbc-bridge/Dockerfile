FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --create-home --uid 10001 --user-group --shell /usr/sbin/nologin appuser
COPY --from=build /workspace/target/app.jar /app/app.jar
RUN mkdir -p /app/sqlite-sources && chown 10001:10001 /app/sqlite-sources
ADD --chown=10001:10001 --chmod=0444 --checksum=sha256:bdf635be69850bd3be09c9a2dbeef7ddfb80036bd3ef3381383cd03b61e4a61a https://raw.githubusercontent.com/dbeaver/dbeaver/b59edd36ff94abfea48f5151a5ea10b3791137f0/plugins/org.jkiss.dbeaver.ui.config.sample/data/Chinook.db /app/sqlite-sources/Chinook.db
USER 10001
ENV JAVA_OPTS="-XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError"
EXPOSE 10000
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
