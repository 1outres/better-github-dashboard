{
  description = "Better GitHub Dashboard - Chrome 拡張機能の開発環境";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            pnpm
          ];

          shellHook = ''
            echo "📦 better-github-dashboard devshell"
            echo "  node: $(node --version)"
            echo "  pnpm: $(pnpm --version)"
          '';
        };
      });
}
