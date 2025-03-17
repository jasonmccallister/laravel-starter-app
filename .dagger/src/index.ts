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

    constructor(
        @argument({ defaultPath: "/", ignore: ["vendor*", "node_modules*"] })
        source: Directory,
    ) {
        this.source = source;
    }

    /**
     * Run artisan commands in the container
     */
    @func()
    async artisan(args: string): Promise<string> {
        let container = await this.build();

        return container
            .withExec(["php", "artisan", ...args.split(" ")])
            .stdout();
    }

    /**
     * Run the server as a service exposed to the host
     */
    @func()
    async serve(): Promise<Service> {
        let container = await this.build();

        return container.withExposedPort(8080).asService();
    }

    /**
     * Build the application
     */
    @func()
    async build(): Promise<Container> {
        let composer = dag
            .composer({
                source: this.source,
                enableCache: true,
            })
            .install();

        let node = dag
            .container()
            .from("node:23-alpine")
            .withWorkdir("/app")
            .withDirectory("/app", this.source)
            .withDirectory("/app/vendor", composer)
            .withExec(["npm", "install"])
            .withExec(["npm", "run", "build"])
            .directory("/app/public/build");

        let ctr = dag
            .container()
            .from("trafex/php-nginx")
            .withMountedDirectory("/var/www/html", this.source, {
                owner: "nobody",
            })
            .withDirectory("/var/www/html/vendor", composer)
            .withDirectory("/var/www/html/public/build", node);

        // install extra php extensions needed by laravel
        ctr = ctr
            .withUser("root") // switch to root to install dependencies
            .withExec([
                "apk",
                "add",
                "--no-cache",
                "php84-pdo_mysql",
                "php84-pdo_sqlite",
            ]);

        // grab the nginx config file from the container
        let config = await ctr
            .file("/etc/nginx/conf.d/default.conf")
            .contents();

        // ... and replace the root path with /var/www/html/public
        config = config.replace(
            /root\s+\/var\/www\/html;/,
            "root /var/www/html/public;",
        );

        return ctr
            .withUser("nobody") // switch back to nobody to fix permissions
            .withNewFile("/etc/nginx/conf.d/default.conf", config);
    }
}
