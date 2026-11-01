fn greet(name: &str) -> String {
    format!("Hello, {name}!")
}

fn main() {
    println!("{}", greet("Midas"));
}

#[cfg(test)]
mod tests {
    use super::greet;

    #[test]
    fn greet_includes_name() {
        assert_eq!(greet("Midas"), "Hello, Midas!");
    }
}
