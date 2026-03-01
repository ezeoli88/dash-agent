use agent_board::RunArgs;
use clap::Parser;

#[derive(Parser, Debug)]
#[command(name = "agent-board", version, about = "AI Agent Dashboard Server")]
pub struct Args {
    /// Port to listen on (overrides PORT env var)
    #[arg(long)]
    pub port: Option<u16>,

    /// Path to SQLite database file
    #[arg(long)]
    pub database_path: Option<String>,

    /// Don't open the browser automatically
    #[arg(long)]
    pub no_open: bool,

    /// Don't pause on error (Windows double-click mode)
    #[arg(long)]
    pub no_pause_on_error: bool,
}

impl From<Args> for RunArgs {
    fn from(args: Args) -> Self {
        RunArgs {
            port: args.port,
            database_path: args.database_path,
            no_open: args.no_open,
        }
    }
}

fn main() {
    let args = Args::parse();

    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to create Tokio runtime");

    rt.block_on(async {
        if let Err(e) = agent_board::run(args).await {
            eprintln!("Failed to start agent-board: {e}");
            #[cfg(windows)]
            {
                if !std::env::args().any(|a| a == "--no-pause-on-error") {
                    eprintln!("\nPress Enter to close (auto-close in 30s)...");
                    let _ = tokio::time::timeout(
                        std::time::Duration::from_secs(30),
                        tokio::io::AsyncBufReadExt::read_line(
                            &mut tokio::io::BufReader::new(tokio::io::stdin()),
                            &mut String::new(),
                        ),
                    )
                    .await;
                }
            }
            std::process::exit(1);
        }
    });
}
