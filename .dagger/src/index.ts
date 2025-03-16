import {
    dag,
    Container,
    Directory,
    object,
    func,
    Service,
    argument,
} from "@dagger.io/dagger";

@object()
export class LaravelStarterApp {
    source: Directory;

    constructor(@argument({ defaultPath: "/" }) source: Directory) {
        this.source = source;
    }

    @func()
    async run(): Promise<Service> {
        let container = await this.build();

        return container.withExposedPort(8080).asService();
    }

    @func()
    async build(): Promise<Container> {
        let composer = dag
            .composer({
                source: this.source,
            })
            .install();

        let container = dag
            .container()
            .from("trafex/php-nginx")
            .withDirectory("/var/www/html/vendor", composer)
            .withMountedDirectory("/var/www/html", this.source, {
                owner: "nobody",
            });

        // install extra php extensions
        container = container
            .withUser("root")
            .withExec([
                "apk",
                "add",
                "--no-cache",
                "php84-pdo_mysql",
                "php84-pdo_sqlite",
            ]);

        // grab the nginx config file
        let config = await container
            .file("/etc/nginx/conf.d/default.conf")
            .contents();

        // replace the root with /var/www/html/public
        config = config.replace(
            /root\s+\/var\/www\/html;/,
            "root /var/www/html/public;",
        );

        // set the owner on /var/www/html/storage/ to nobody
        // container = container.withExec([
        //     "chown",
        //     "-R",
        //     "nobody",
        //     "/var/www/html/storage",
        // ]);

        return container
            .withUser("nobody")
            .withNewFile("/etc/nginx/conf.d/default.conf", config);
    }
}
