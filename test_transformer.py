import sys
import os
# Ensure nodes directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/nodes")
from transformer import ShimaTransformer

def test_transformer():
    transformer = ShimaTransformer()
    
    print("--- Test 1: Unconditional Override (Orange replaces Apple) ---")
    # input is "Apple", widget says "Orange"
    res = transformer.execute(
        output_as_strings=True,
        in_1="Apple",
        map_1="Orange"
    )
    print(f"Result: {res[0]}")
    assert res[0] == "Orange"
    
    print("\n--- Test 2: Atomic Ordering (Mismatch follows through to override) ---")
    # input is "0", widget skip 1, hits override on second line
    res = transformer.execute(
        output_as_strings=True,
        in_1="0",
        map_1="1 ||| True\nFalse"
    )
    print(f"Result: {res[0]}")
    assert res[0] == "False"

    print("\n--- Test 3: Top-to-Bottom Priority (Override beats conditional below it) ---")
    # input is "Apple", but "Orange" is first line and catchall
    res = transformer.execute(
        output_as_strings=True,
        in_1="Apple",
        map_1="Orange\nApple ||| Kiwi"
    )
    print(f"Result: {res[0]}")
    assert res[0] == "Orange"

    print("\n--- Test 4: Logic Independent on Each Stream ---")
    # Stream 1: match, Stream 2: override, Stream 3: mismatch passthrough
    res = transformer.execute(
        output_as_strings=False,
        in_1="MatchMe",
        map_1="MatchMe ||| Found",
        in_2="Original",
        map_2="Override",
        in_3="SailingThrough",
        map_3="NoMatch ||| Nothing"
    )
    print(f"Result: {res}")
    assert res[0] == "Found"
    assert res[1] == "Override"
    assert res[2] == "SailingThrough"

    print("\n--- Test 5: Explicit Pass-through (Empty matched value) ---")
    res = transformer.execute(
        output_as_strings=True,
        in_1="KeepMe",
        map_1="KeepMe ||| \nOverride",
    )
    print(f"Result: {res[0]}")
    assert res[0] == "KeepMe"

    print("\n--- Test 6: Mapping multiple numbers (User example) ---")
    # 0 -> pancakes, 1 -> eggs...
    res = transformer.execute(
        output_as_strings=True,
        in_1=0,
        map_1="0 ||| pancakes\n1 ||| eggs\n2 ||| bacon",
        in_2=1,
        map_2="0 ||| pancakes\n1 ||| eggs\n2 ||| bacon"
    )
    print(f"Result: {res[0]}, {res[1]}")
    assert res[0] == "pancakes"
    assert res[1] == "eggs"

    print("\n--- Test 7: Variable Injection (Basic Template) ---")
    res = transformer.execute(
        output_as_strings=True,
        in_1="landscape",
        map_1="landscape ||| A !!! with @@@ skies",
        **{"var_!!!": "Portrait", "var_@@@": "Blue"}
    )
    print(f"Result: {res[0]}")
    assert res[0] == "A Portrait with Blue skies"

    print("\n--- Test 8: Standalone Token Override ---")
    res = transformer.execute(
        output_as_strings=True,
        in_1="anything",
        map_1="###",
        **{"var_###": "StandaloneValue"}
    )
    print(f"Result: {res[0]}")
    assert res[0] == "StandaloneValue"

    print("\n--- Test 9: Null Variable Fallback ('no value set') ---")
    res = transformer.execute(
        output_as_strings=True,
        in_1="test",
        map_1="Status: $$$",
        **{"var_$$$": None} # Not connected
    )
    print(f"Result: {res[0]}")
    assert res[0] == "Status: no value set"

    print("\n--- Test 10: Type-Aware Variable Injection (Int -> String -> Int) ---")
    # var_!!! is 42 (int), template is "!!!", should infer int 42
    res = transformer.execute(
        output_as_strings=False,
        in_1="trigger",
        map_1="trigger ||| !!!",
        **{"var_!!!": 42}
    )
    print(f"Result: {res[0]} (Type: {type(res[0])})")
    assert res[0] == 42
    assert isinstance(res[0], int)

    print("\n--- Test 11: Boolean Matching (Fix for user report) ---")
    # input is True (bool), map is "true ||| Match"
    res = transformer.execute(
        output_as_strings=True,
        in_1=True, # bool True
        map_1="true ||| Match_Lower"
    )
    print(f"Result (true): {res[0]}")
    assert res[0] == "Match_Lower"

    res = transformer.execute(
        output_as_strings=True,
        in_1=True, # bool True
        map_1="TRUE ||| Match_Upper"
    )
    print(f"Result (TRUE): {res[0]}")
    assert res[0] == "Match_Upper"

    res = transformer.execute(
        output_as_strings=True,
        in_1=True, # bool True
        map_1="1 ||| Match_Numeric"
    )
    print(f"Result (1): {res[0]}")
    assert res[0] == "Match_Numeric"

    res = transformer.execute(
        output_as_strings=True,
        in_1=False, # bool False
        map_1="false ||| Match_False"
    )
    print(f"Result (false): {res[0]}")
    assert res[0] == "Match_False"

    print("\n[SUCCESS] All Transformer logic tests passed!")

if __name__ == "__main__":
    test_transformer()
