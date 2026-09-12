# Native runtime interrupt lifecycle finality

Terminal timeout and rejection outcomes are durable across deployments. Worker retries may observe the existing outcome but cannot create a second terminal action or restart the run.
